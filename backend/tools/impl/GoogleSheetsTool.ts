import { ITool } from "../ITool";

/**
 * GoogleSheetsTool — Appends a row to a Google Sheet via the Sheets API.
 *
 * Setup:
 * 1. Go to Google Cloud Console → Enable Google Sheets API
 * 2. Create a Service Account → Download JSON key
 * 3. Share your spreadsheet with the Service Account email
 * 4. Set GOOGLE_SHEETS_SPREADSHEET_ID and GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in .env.local
 */
export class GoogleSheetsTool implements ITool {
    name = "GoogleSheetsTool";
    description = "Appends a new row to a Google Spreadsheet. Use this to log leads, form submissions, image data, or any structured event data automatically.";
    parameters = {
        type: "object",
        properties: {
            sheetName: { type: "string", description: "The name of the sheet/tab to append to (default: Sheet1)" },
            data: { type: "object", description: "Key-value pairs to log as columns in the spreadsheet" }
        },
        required: ["data"]
    };

    async execute(ownerId: string, args: Record<string, any>): Promise<string> {
        const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
        const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

        if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
            console.warn("[GoogleSheetsTool] Google Sheets credentials not set. Logging skipped.");
            return "Warning: Google Sheets not configured. Add GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_PRIVATE_KEY to your environment.";
        }

        const { data, sheetName = "Sheet1" } = args;
        const rowValues = Object.values({ ...data, timestamp: new Date().toISOString(), ownerId });

        try {
            // Get OAuth2 access token using Service Account JWT
            const accessToken = await this.getAccessToken(serviceAccountEmail, privateKey);

            const range = `${sheetName}!A1`;
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    values: [rowValues.map(v => String(v ?? ""))]
                }),
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Sheets API error: ${err}`);
            }

            console.log(`[GoogleSheetsTool] Row appended to ${sheetName} for owner: ${ownerId}`);
            return `Success: Row appended to Google Sheet "${sheetName}" with ${Object.keys(data).length} columns.`;

        } catch (err: any) {
            console.error("[GoogleSheetsTool] Failed:", err.message);
            return `Failed: Could not write to Google Sheets. Error: ${err.message}`;
        }
    }

    private async getAccessToken(email: string, privateKey: string): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
        const payload = Buffer.from(JSON.stringify({
            iss: email,
            scope: "https://www.googleapis.com/auth/spreadsheets",
            aud: "https://oauth2.googleapis.com/token",
            iat: now,
            exp: now + 3600,
        })).toString("base64url");

        const crypto = await import("crypto");
        const sign = crypto.createSign("RSA-SHA256");
        sign.update(`${header}.${payload}`);
        const signature = sign.sign(privateKey, "base64url");

        const jwt = `${header}.${payload}.${signature}`;

        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
        });

        const tokenData = await tokenRes.json() as { access_token: string };
        return tokenData.access_token;
    }
}
