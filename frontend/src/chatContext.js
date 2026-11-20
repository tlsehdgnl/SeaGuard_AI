// Small in-memory hand-off from screens to the guide characters' chat (e.g. the live route on the plan screen).
const store = {};
export function setChatContext(key, value) { if (value == null) delete store[key]; else store[key] = value; }
export function getChatContext() { return {...store}; }
