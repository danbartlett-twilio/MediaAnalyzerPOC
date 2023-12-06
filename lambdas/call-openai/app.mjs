/**
 *  call-openai
 * 
 * Lambda function subscribed to SNS Topic. Receives
 * new messages, parses the message body, selects 
 * the best prompt to use, builds the api call,
 * calls OpenAI, waits for reply, publishes reply
 * to SNS topic for additional processing.
 */

import OpenAI from "openai";
const OPENAI_API_KEY= process.env.OPENAI_API_KEY;
const openai = new OpenAI( { apiKey :OPENAI_API_KEY } );

import  { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
const snsClient = new SNSClient({ region: process.env.REGION });

/**
 * Prompts are determined by key word sent along with the image(s). Add/edit prompts
 * below as needed!
 */
const mediaPrompts = {
    'dog': 'Is there a dog in this image? If yes, determine the breed. Give your response in JSON where the is_dog variable declares whether a dog is present and the breed variable is your determination of breed.',
    'screenshot': 'Is this image a screenshot? If yes, is there a warning message? Respond with a yes or no regarding if there are warning messages. Summarize the messages in less than 15 words.',
    'category': 'Can this image be categorized as a photograph, a cartoon, a drawing, or a screenshot? Give your response in JSON where the category goes in the category variable and then add a description variable and give a concise description of the image. Respond with a JSON object with category and description properties.',
    'text': 'Is there any text in this image? If yes, what are the first few words.',
    'insurance':'Does this image show damage to a vehicle? If yes, where is the damage and what type of vehicle?',
    'retail': 'Are the clothing items in this image Mens or Womens? What type of clothing is it?',
    'recommend': 'Please recommend some products that go with the product in this image.',
    'tool': 'What type of tool should I use for this screw or bolt?',
    'repair':'Is there any appliance in this image and if yes, what type of appliance is in the image? Is there any damage to the appliance?',
    'people':'Are there people in this image? If yes how many?',
    'ingredients' : "Please identify the ingredients in this meal.",
    'returns':'What type of product is in the image? Does there appear to be any damage to the product in the image? Give a concise response.',    
    'default': 'Write a caption for this image that is less than 15 words.'
  };

async function getPrompt ( mediaObject ) {

    // based on body of SMS message, create prompt
    let bodyText = mediaObject.Body.trim().toLowerCase();

    // Pull the prompt from the object above.
    let promptText = (mediaPrompts[bodyText]) ? mediaPrompts[bodyText] : mediaPrompts['default'];
    //let promptText = "Write a caption for this image that is less than 15 words.";    

    // Adjust your params as needed!
    let prompt = {
        model: "gpt-4-vision-preview",
        max_tokens: 1024,
        messages: [
          {
            role: "user",        
            content: [
              { type: "text", text: promptText },
              {
                type: "image_url",
                
                image_url: {
                  "url": mediaObject.MediaUrl,
                  detail: "low"
                },
              },
            ],
          },
        ],
      }

    return prompt;

} 

/**
 * Using the OpenAI client, make the api call and wait for the response.
 */
async function callOpenAI ( promptObject ) {

    // call open AI and wait for response...
    const response = await openai.chat.completions.create(promptObject);

    //console.log("OpenAI response => ", response);
    
    return response;
} 

async function publishToSNS ( snsObject ) {

    // Send the result to SNS for additional processing...

    let snsParams = {
        Message: JSON.stringify(snsObject),            
        TopicArn: process.env.SNS_TOPIC
    };           

    // Send MEDIA Files to SNS MEDIA TOPIC
    try {
        
        await snsClient.send(new PublishCommand(snsParams));                    

    } catch (err) {
        
        console.log("Error publishing message to SNS MEDIA TOPIC!", err.stack);

    }          

} 

export const lambdaHandler = async (event, context) => {
    
    let messageBody = JSON.parse(event.Records[0].Sns.Message);

    //console.info("EVENT\n" + JSON.stringify(event, null, 2));    
    //console.info("Message\n" + JSON.stringify(messageBody, null, 2));
    /**
     * {
            "MediaContentType": "image/jpeg",
            "MediaUrl": "https://api.twilio.com/2010-04-01/Accounts/AC7dbxx/Messages/MM472xx/Media/ME834fxx",
            "MessageSid": "MM472xxxxxxxxxxxxxxxxxxxxxxxx",
            "AccountSid": "AC7dbxx",
            "MediaId": "ME834xx",
            "Body": "",
            "From": "+194xxxxxxx",
            "To": "+184xxxxxxx"
        }
     */

        // GET PROMPT
        let prompt = await getPrompt(messageBody);

        //console.log ("prompt => ", prompt);

        // CALL OPENAI
        let openAIResult = await callOpenAI(prompt);
        
        // PUBLISH RESULTS TO SNS TOPIC
        let snsObject = {
            ...messageBody,
            openAIResult: openAIResult
        }

        await publishToSNS(snsObject)

};