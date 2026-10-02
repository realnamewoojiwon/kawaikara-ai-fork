// Background downloads are removed from AI fork.
export class KawaiBgTaskManager {
    private static instance = new KawaiBgTaskManager();
    static getInstance() { return this.instance; }
    async initialize() {}
}
