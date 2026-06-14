class MockMutationProvider {
    constructor() {
        this._mutations = [];
    }

    addMutation(mutation) {
        this._mutations.push(mutation);
    }

    clear() {
        this._mutations = [];
    }

    async fetchLatestMutations() {
        const result = [...this._mutations];
        this._mutations = [];
        return result;
    }
}

module.exports = { MockMutationProvider };
