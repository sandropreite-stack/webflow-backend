import express from 'express';
import { createNewCustomerDoc, appendToOverviewSheet } from './google-services.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to allow cross-origin requests from the browser
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Middleware to parse incoming JSON payload
app.use(express.json());

// Webhook endpoint to receive Webflow data
app.post('/webhook/webflow', async (req, res) => {
    try {
        console.log('Received Webflow webhook data:', req.body);
        
        // Extract data (Adjust these fields based on your actual Webflow form fields)
        const customerData = {
            name: req.body.name || req.body['first-name'] || 'New Customer',
            email: req.body.email || 'No Email Provided',
            company: req.body.company || 'N/A',
            message: req.body.message || 'No Message'
            // Add any other fields you collect from Webflow here
        };

        console.log('Processed customer data:', customerData);

        // 1. Create a new Google Document for this customer
        console.log('Creating new Google Doc...');
        const docResult = await createNewCustomerDoc(customerData);
        
        console.log(`Document created successfully: ${docResult.url}`);

        // 2. Append the new customer to the master Overview Google Sheet
        console.log('Appending row to Overview Sheet...');
        await appendToOverviewSheet(customerData, docResult.url);
        console.log('Overview Sheet updated successfully.');

        // Respond to Webflow that the webhook was received and processed
        res.status(200).json({ 
            success: true, 
            message: 'Webhook processed successfully',
            documentId: docResult.id,
            documentUrl: docResult.url
        });

    } catch (error) {
        console.error('Error processing Webflow webhook:', error);
        res.status(500).json({ success: false, error: 'Failed to process webhook' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Waiting for Webflow webhooks at http://localhost:${PORT}/webhook/webflow`);
});
