import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

// Initialize the Google Auth client
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    // Google private keys contain literal \n characters that need parsing
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  // Scopes needed for Drive, Docs, and Sheets
  scopes: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/spreadsheets',
  ],
});

const docs = google.docs({ version: 'v1', auth });
const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });

/**
 * Creates a new Google Document for a customer.
 * 
 * @param {Object} customerData - The data parsed from the Webflow webhook.
 * @returns {Promise<{id: string, url: string}>} - ID and URL of the created document.
 */
export async function createNewCustomerDoc(customerData) {
  const docTitle = `Customer: ${customerData.name}`;

  try {
    // Check if we use a template or create a blank one
    const templateId = process.env.TEMPLATE_DOC_ID;

    let newDocId;

    if (templateId) {
      // Find destination folder from Env, or use empty
      const destFolderId = process.env.DESTINATION_FOLDER_ID;
      
      const copyBody = {
        name: docTitle,
      };
      // If a destination folder is provided, place the new file there!
      if (destFolderId) {
        copyBody.parents = [destFolderId];
      }

      // Duplicate from existing template
      const driveResponse = await drive.files.copy({
        fileId: templateId,
        supportsAllDrives: true,
        requestBody: copyBody,
      });
      newDocId = driveResponse.data.id;
      
      // Optionally, replace standard tags in the template with customer data here using docs.documents.batchUpdate
      
    } else {
      // Create a brand new blank document
      const docResponse = await docs.documents.create({
        requestBody: {
          title: docTitle,
        },
      });
      newDocId = docResponse.data.documentId;

      // Insert basic text into the blank document
      const textToInsert = `Name: ${customerData.name}\nEmail: ${customerData.email}\nCompany: ${customerData.company}\nMessage: ${customerData.message}\n\nGenerated automatically via Webflow webhook.\n`;
      
      await docs.documents.batchUpdate({
        documentId: newDocId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: textToInsert
              }
            }
          ]
        }
      });
    }

    // A newly created document by a service account is owned by the service account.
    // If you want your normal Google account to be able to see/edit it, you have to share it!
    if (process.env.YOUR_GOOGLE_EMAIL) {
      await drive.permissions.create({
        fileId: newDocId,
        requestBody: {
          role: 'writer',
          type: 'user',
          emailAddress: process.env.YOUR_GOOGLE_EMAIL,
        },
      });
    }

    return {
      id: newDocId,
      url: `https://docs.google.com/spreadsheets/d/${newDocId}/edit`
    };

  } catch (error) {
    console.error('Failed to create customer document:', error);
    throw error;
  }
}

/**
 * Appends a row of data to the master spreadsheet.
 * 
 * @param {Object} customerData - User data from Webflow.
 * @param {string} docUrl - URL to the created Google Document.
 */
export async function appendToOverviewSheet(customerData, docUrl) {
  const spreadsheetId = process.env.OVERVIEW_SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.warn('No OVERVIEW_SPREADSHEET_ID set in .env. Skipping spreadsheet update.');
    return;
  }

  try {
    const timestamp = new Date().toLocaleString();
    
    // The data to append (must match your spreadsheet column order)
    const values = [
      [timestamp, customerData.name, customerData.email, customerData.phone, customerData.company, customerData.message, docUrl]
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Tabellenblatt1!A:F', // Modify if your tab is named differently
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

  } catch (error) {
    console.error('Failed to append to Overview Sheet:', error);
    throw error;
  }
}
