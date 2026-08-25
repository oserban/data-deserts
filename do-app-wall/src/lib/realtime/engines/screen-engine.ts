import { wallStore } from '../stores/wall-store';
import type { BusMessage, HelloBusMessage, StateBusMessage, WallStoreState } from '../types';
import { BusEngine } from './bus-engine';

class ScreenEngine extends BusEngine<WallStoreState> {
    private constructor() {
        super('screen', wallStore);
    }
    static getInstance() {
        const singleton = globalThis as typeof globalThis & { __dataDesertsScreen?: ScreenEngine };
        return (singleton.__dataDesertsScreen ??= new ScreenEngine());
    }
    protected override onMessage(message: BusMessage) {
        if (message.type === 'state/update')
            this.store.setState((previous) => ({
                ...previous,
                ...(message as StateBusMessage).state
            }));
    }
    protected override onHello(hello: HelloBusMessage) {
        if (hello.state) this.store.setState((previous) => ({ ...previous, ...hello.state }));
    }
}
export const screenEngine = ScreenEngine.getInstance();
