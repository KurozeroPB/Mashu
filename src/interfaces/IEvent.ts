import Mashu from "../utils/MashuClient";
import { ISettings } from "../interfaces/ISettings";

export interface IEvent {
    name: string;
    run: (client: Mashu, settings: ISettings, ...args: any[]) => Promise<void>;
}
