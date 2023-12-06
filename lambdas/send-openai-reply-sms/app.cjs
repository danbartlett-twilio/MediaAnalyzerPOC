/**
 *  send-openai-reply-sms
 * 
 * Lambda function subscribed to SNS topic.
 * Opens message checks if it has image analysis from
 * OpenAI, if it does, send a reply SMS back with the
 * response from OpenAI.
 *
 */

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = require('twilio')(accountSid, authToken);

async function sendReplyMessage(message) {
    
    //console.log("message => ", message);
    
    if (message.openAIResult.choices[0].message.content === undefined) {

        return false;

    }

    // Params of message to send to Twilio
    // This is encoded into body of POST call
    let msg = {
        from: message.To,
        to: message.From,
        body: message.openAIResult.choices[0].message.content,
    };

    // "feature flag". If you want to disable send SMS messages,
    // you can change this environment variable to NO.
    if (process.env.SEND_SMS === 'YES') {

        try {
                        
            const tmsg = await twilioClient.messages.create({
                from: message.To,
                to: message.From,
                body: message.openAIResult.choices[0].message.content,
              });            
            //console.log("tmsg => ", tmsg);

        } catch (error) {
            // You can implement your fallback code here
            console.error(error);
        }

    } else {

        console.log("SMS sending is OFF per the SEND_SMS environment variable.");
        return true;

    } 

}

exports.lambdaHandler = async function (event, context) { 

    let messageBody = JSON.parse(event.Records[0].Sns.Message);

    console.info("EVENT\n" + JSON.stringify(event, null, 2));    
    console.info("Message\n" + JSON.stringify(messageBody, null, 2));    

    if (messageBody.openAIResult !== undefined) {
        
        await sendReplyMessage(messageBody);

    } else {

        console.info("Message is not a MEDIA image.");    

    }

};