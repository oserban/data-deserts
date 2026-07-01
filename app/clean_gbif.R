#!/usr/bin/env Rscript
# ---------------------------------------------------------------------------
# Cleaned per-country GBIF occurrence counts, via the canonical GBIF R package.
#
# This is the reproducible / provenance version of fetch_gbif_clean.py. It uses
# rgbif::occ_count() so the query is expressed through the official package the
# GBIF community uses, and produces the identical cleaned counts.
#
# Cleaning = GBIF quality filters applied AT QUERY TIME (see GBIF_CLEANING.md):
#     hasCoordinate      = TRUE      georeferenced records only
#     hasGeospatialIssue = FALSE     drops 0/0, out-of-range, country-centroid mismatch…
#     occurrenceStatus   = PRESENT   drops explicit ABSENT records
#     basisOfRecord      : drop FOSSIL_SPECIMEN (palaeo) and LIVING_SPECIMEN (captive)
#
# We do NOT run CoordinateCleaner here: it flags bad *individual records* by
# coordinate and therefore needs the record-level download (~3.8B records) — out
# of scope for a country-level density map. GBIF_CLEANING.md documents that as
# the upgrade path (rgbif::occ_download + CoordinateCleaner::clean_coordinates).
#
# Install once:  install.packages(c("rgbif", "jsonlite"))
# Run:           Rscript clean_gbif.R
# ---------------------------------------------------------------------------
suppressPackageStartupMessages({
  library(rgbif)
  library(jsonlite)
})

here     <- dirname(normalizePath(sub("--file=", "",
             grep("--file=", commandArgs(FALSE), value = TRUE)[1])))
data_dir <- file.path(here, "data")

raw    <- fromJSON(file.path(data_dir, "gbif_counts.json"))   # named ISO2 -> raw count
codes  <- names(raw)[order(-unlist(raw))]                     # busiest first

core <- list(hasCoordinate = TRUE, hasGeospatialIssue = FALSE,
             occurrenceStatus = "PRESENT")

# clean = (all core-filtered) minus fossils minus living specimens
count_clean <- function(iso2) {
  q     <- function(extra = list()) do.call(occ_count,
              c(list(country = iso2), core, extra))
  total <- q()
  foss  <- q(list(basisOfRecord = "FOSSIL_SPECIMEN"))
  live  <- q(list(basisOfRecord = "LIVING_SPECIMEN"))
  as.numeric(total) - as.numeric(foss) - as.numeric(live)
}

clean  <- list(); report <- list()
for (i in seq_along(codes)) {
  iso2 <- codes[i]
  c <- tryCatch(count_clean(iso2), error = function(e) NA_real_)
  if (is.na(c)) next
  r <- as.numeric(raw[[iso2]])
  clean[[iso2]]  <- c
  report[[iso2]] <- list(raw = r, clean = c,
                         removed_pct = if (r > 0) round(100 * (r - c) / r, 1) else 0)
  if (i <= 25 || i %% 25 == 0)
    cat(sprintf("  [%3d/%3d] %s  raw %-12.0f clean %-12.0f (-%.1f%%)\n",
                i, length(codes), iso2, r, c, report[[iso2]]$removed_pct))
  Sys.sleep(0.15)
}

tot_raw   <- sum(vapply(names(clean), function(k) as.numeric(raw[[k]]), 0))
tot_clean <- sum(unlist(clean))
meta <- list(source = "GBIF via rgbif::occ_count (filtered counts)",
             filters = list(hasCoordinate = "TRUE", hasGeospatialIssue = "FALSE",
                            occurrenceStatus = "PRESENT",
                            basisOfRecord_dropped = c("FOSSIL_SPECIMEN", "LIVING_SPECIMEN")),
             countries = length(clean), total_raw = tot_raw, total_clean = tot_clean,
             total_removed_pct = round(100 * (tot_raw - tot_clean) / tot_raw, 1))

write_json(clean, file.path(data_dir, "gbif_counts_clean.json"),
           auto_unbox = TRUE, digits = 0)
write_json(list(`_meta` = meta, byCountry = report),
           file.path(data_dir, "gbif_clean_report.json"),
           auto_unbox = TRUE, pretty = TRUE, digits = 0)

cat(sprintf("\nDone. %d countries. Total raw %.0f -> clean %.0f (-%.1f%%)\n",
            length(clean), tot_raw, tot_clean, meta$total_removed_pct))
