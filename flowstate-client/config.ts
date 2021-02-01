export interface Settings {
    accountId: string;
    valid?: boolean;
}

export function validateSettings(settings: Settings) {
    if (settings.valid) {
        return;
    }

    if (settings.accountId.length < 3 || settings.accountId.length > 32) {
        throw Error("accountId is invalid or missing");
    }
    settings.valid = true;
}