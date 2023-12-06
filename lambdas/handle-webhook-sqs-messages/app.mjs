/**
 * handle-webhook-sqs-messages
 * 
 * Lambda function that is triggered by SQS. Opens
 * message, check x-twilio-signature, publishes message
 * to SNS topic for downstream processing. Checks message
 * for any media files, if present, separate each media file
 * and publish to SNS Media topic.
 */
import  querystring from 'node:querystring';
import { getSignature } from '/opt/calculate-twilio-signature-for-webhook.mjs';
import  { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const snsClient = new SNSClient({ region: process.env.REGION });

async function processRecord(record) {

    //console.log(`Processing ${record.messageId}`);

    let url = `https://${record.messageAttributes.domainName.stringValue}${record.messageAttributes.path.stringValue}`;
    
    // Decode the request body
    let bodyParams = querystring.decode(record.body);           
    
    // This is the header passed from twilio
    let passedTwilioSignature = record.messageAttributes['x-twilio-signature'].stringValue;
    
    // Calculated what the twilio header should be
    let calculatedTwilioSignature = await getSignature(process.env.TWILIO_AUTH_TOKEN, url, bodyParams);
    
    //console.log('calculatedTwilioSignature => ', calculatedTwilioSignature);
    //console.log('passedTwilioSignature => ', passedTwilioSignature);

    // Check to be sure the header from twilio is valid before processing!
    if (calculatedTwilioSignature === passedTwilioSignature) {
            
        // Signatures Match! Publish to SNS Topic
        let snsObject = {
            ...bodyParams,
            sqs_record:record.messageId,
            timestamp:parseInt(record.attributes.ApproximateFirstReceiveTimestamp)
        };
               
        console.log("Publishing SNS Record =====> ");    
        console.log(JSON.stringify(snsObject, 2, null));    
        
        const params = {
            Message: JSON.stringify(snsObject),            
            TopicArn: process.env.SNS_TOPIC
        };
          
        // Send complete Webhook to SNS
        try {
            
            await snsClient.send(new PublishCommand(params));            
            

        } catch (err) {
            
            console.log("Error publishing message to Topic!", err.stack);

        }     

        let numMedia = parseInt(snsObject.NumMedia);
        console.log("numMedia => ",  numMedia);        
        
        // Check if media present!
        if (numMedia > 0) {

            for ( let i = 0; i < numMedia; i++ ) {                

                let mediaSNSObject = {
                    MediaContentType: snsObject[`MediaContentType${i}`],
                    MediaUrl: snsObject[`MediaUrl${i}`],
                    MessageSid: snsObject.MessageSid,
                    AccountSid: snsObject.AccountSid,
                    MediaId: snsObject[`MediaUrl${i}`].split("/").pop(),
                    Body: snsObject.Body,
                    From: snsObject.From,
                    To: snsObject.To,
                    timestamp: snsObject.timestamp
                }
                let mediaSNSParams = {
                    Message: JSON.stringify(mediaSNSObject),            
                    TopicArn: process.env.SNS_MEDIA_TOPIC
                };       
                
                console.log("mediaSNSParams => ", mediaSNSParams);

                // Send MEDIA Files to SNS MEDIA TOPIC
                try {
                    
                    await snsClient.send(new PublishCommand(mediaSNSParams));                    

                } catch (err) {
                    
                    console.log("Error publishing message to SNS MEDIA TOPIC!", err.stack);

                }                              

            }
        }

    } else {
        
        console.warn('x-twilio-signature does not match!');        
        console.warn(`SQS Message: ${record.messageId} was not processed!`);
        
        // Add additional security notification here!

    }

}

export const lambdaHandler = async (event, context) => {
    
    //console.log(JSON.stringify(event, 2, null));    

    // Loop through all messages in batch received from SQS
    await Promise.all(event.Records.map(async (record) => {
        
        await processRecord(record);

    }));            

};