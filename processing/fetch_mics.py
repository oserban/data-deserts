#!/usr/bin/env python3
"""Parse MICS SPSS datasets and aggregate participants by country and year.

Counts represent interviewed women plus interviewed men when those questionnaire
files are available; they do not establish unique people across surveys.
Household, household-member, birth-history, and child files are deliberately
excluded because summing them would count households or duplicate people.

The UNICEF download is a ZIP containing one nested ZIP per survey. SPSS SAV
headers contain their case count, so this parser does not need pandas,
pyreadstat, or extraction of the 1+ GB archive.

Run from the repository root:

    python3 processing/fetch_mics.py

Writes ``processing/data/mics.json`` in the shared format:

    {"AFG": {"2010": 14177, "2022": 44874}, ...}

It also writes ``processing/data/mics_report.json`` with survey-level counts
and provenance.
"""

import argparse
import io
import json
import os
import re
import struct
import zipfile


HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
DEFAULT_INPUT = os.path.join(DATA_DIR, "raw", "MICS_Datasets.zip")
DEFAULT_OUTPUT = os.path.join(DATA_DIR, "mics.json")
DEFAULT_REPORT = os.path.join(DATA_DIR, "mics_report.json")

SURVEY_RE = re.compile(
    r"^(?P<iso3>[A-Z]{3})(?:\((?P<area>.+)\))?_(?P<year>\d{4})_"
    r"(?P<round>MICS\d+)_(?P<version>[^/]+)$"
)


def survey_identity(member_name):
    """Parse ISO3, area, year, and round from a top-level survey path."""
    parts = member_name.replace("\\", "/").split("/")
    survey_id = next((part for part in parts if SURVEY_RE.match(part)), None)
    if not survey_id:
        raise ValueError("Cannot parse survey identity from %s" % member_name)
    match = SURVEY_RE.match(survey_id)
    return {
        "surveyId": survey_id,
        "iso3": match.group("iso3"),
        "area": match.group("area"),
        "year": int(match.group("year")),
        "round": match.group("round"),
        "version": match.group("version"),
    }


def questionnaire_type(filename):
    """Return ``women``/``men`` for MICS individual questionnaire files."""
    stem = os.path.splitext(os.path.basename(filename))[0].lower()
    # Older MICS rounds attach a two-letter country code before or after WM.
    if (stem in ("wm", "woman", "women") or
            (len(stem) == 4 and (stem.startswith("wm") or stem.endswith("wm")))):
        return "women"
    # Current rounds use MN; Guinea 2016 uses mnpn.
    if stem in ("mn", "man", "men") or (len(stem) == 4 and stem.startswith("mn")):
        return "men"
    return None


def sav_case_count(data, source_name):
    """Read the case count from an SPSS system-file header."""
    if len(data) < 84 or data[:4] not in (b"$FL2", b"$FL3"):
        raise ValueError("%s is not a supported SPSS system file" % source_name)
    little_layout = struct.unpack("<i", data[64:68])[0]
    big_layout = struct.unpack(">i", data[64:68])[0]
    if little_layout in (2, 3):
        count = struct.unpack("<i", data[80:84])[0]
    elif big_layout in (2, 3):
        count = struct.unpack(">i", data[80:84])[0]
    else:
        raise ValueError("%s has an unsupported SPSS byte layout" % source_name)
    if count < 0:
        raise ValueError("%s does not declare a usable SPSS case count" % source_name)
    return count


def walk_archive(archive, prefix="", depth=0):
    """Yield participant SPSS files, recursively opening nested ZIPs."""
    if depth > 3:
        raise ValueError("Nested ZIP depth exceeds the supported limit at %s" % prefix)
    for member in archive.infolist():
        if member.is_dir():
            continue
        name = member.filename.replace("\\", "/")
        qualified = (prefix + "/" + name).strip("/")
        role = questionnaire_type(name)
        if role and name.lower().endswith(".sav"):
            yield role, qualified, archive.read(member)
        elif name.lower().endswith(".zip"):
            payload = archive.read(member)
            try:
                with zipfile.ZipFile(io.BytesIO(payload)) as nested:
                    yield from walk_archive(nested, qualified, depth + 1)
            except zipfile.BadZipFile as error:
                raise ValueError("Invalid nested ZIP %s" % qualified) from error


def parse_survey(member_name, payload):
    """Return survey metadata and individual-participant counts."""
    survey = survey_identity(member_name)
    counts = {"women": 0, "men": 0}
    files = {"women": [], "men": []}
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        for role, filename, data in walk_archive(archive):
            counts[role] += sav_case_count(data, filename)
            files[role].append(filename)

    women = counts["women"] if files["women"] else None
    men = counts["men"] if files["men"] else None
    if women is not None and men is not None:
        completeness = "women_and_men"
    elif women is not None:
        completeness = "women_only"
    elif men is not None:
        completeness = "men_only"
    else:
        completeness = "missing"
    participants = None if completeness == "missing" else (women or 0) + (men or 0)
    survey.update({
        "participants": participants,
        "women": women,
        "men": men,
        "completeness": completeness,
        "files": files,
    })
    return survey


def aggregate_archive(path):
    """Parse all survey ZIPs and return ordered totals, report, and stats."""
    surveys = []
    with zipfile.ZipFile(path) as archive:
        for index, member in enumerate(archive.infolist(), 1):
            if member.is_dir() or not member.filename.lower().endswith(".zip"):
                continue
            survey = parse_survey(member.filename, archive.read(member))
            surveys.append(survey)
            print("Parsed MICS survey %d: %s" % (index, survey["surveyId"]))

    totals = {}
    stats = {
        "surveys": len(surveys),
        "withParticipants": 0,
        "completeWomenAndMen": 0,
        "partialOneGender": 0,
        "missingParticipants": 0,
        "subnationalSurveys": 0,
    }
    for survey in surveys:
        if survey["area"]:
            stats["subnationalSurveys"] += 1
        if survey["completeness"] == "women_and_men":
            stats["completeWomenAndMen"] += 1
        elif survey["completeness"] == "missing":
            stats["missingParticipants"] += 1
        else:
            stats["partialOneGender"] += 1
        if survey["participants"] is not None:
            stats["withParticipants"] += 1
            yearly = totals.setdefault(survey["iso3"], {})
            year = str(survey["year"])
            yearly[year] = yearly.get(year, 0) + survey["participants"]

    ordered = {
        iso3: dict(sorted(yearly.items()))
        for iso3, yearly in sorted(totals.items())
    }
    surveys.sort(key=lambda item: (item["iso3"], item["year"], item["surveyId"]))
    return ordered, surveys, stats


def write_json_atomic(path, data, indent=None):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as output:
        json.dump(data, output, ensure_ascii=False, indent=indent,
                  separators=None if indent else (",", ":"))
        output.write("\n")
    os.replace(temporary, path)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=DEFAULT_INPUT,
                        help="UNICEF MICS dataset archive (default: processing/data/raw/MICS_Datasets.zip)")
    parser.add_argument("--output", default=DEFAULT_OUTPUT,
                        help="Participant aggregation (default: processing/data/mics.json)")
    parser.add_argument("--report", default=DEFAULT_REPORT,
                        help="Survey report (default: processing/data/mics_report.json)")
    return parser.parse_args()


def main():
    args = parse_args()
    totals, surveys, stats = aggregate_archive(args.input)
    participant_total = sum(value for yearly in totals.values() for value in yearly.values())
    metadata = {
        "source": "UNICEF Multiple Indicator Cluster Surveys (MICS)",
        "sourceUrl": "https://mics.unicef.org/surveys",
        "participantDefinition": "women's interview rows + men's interview rows when available",
        "householdsAreParticipants": False,
        "childRecordsAreParticipants": False,
        "countries": len(totals),
        "participants": participant_total,
        **stats,
    }
    write_json_atomic(args.output, totals)
    write_json_atomic(args.report, {"_meta": metadata, "surveys": surveys}, indent=2)
    print("Wrote %s: %d countries, %s participants from %d/%d surveys" %
          (args.output, len(totals), format(participant_total, ","),
           stats["withParticipants"], stats["surveys"]))
    print("Wrote %s: survey-level participant provenance" % args.report)


if __name__ == "__main__":
    main()
