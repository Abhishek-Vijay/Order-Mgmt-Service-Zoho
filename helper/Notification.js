// uuid import 
const { UUIDGenerator } = require('./generator');
const envVariables = require('./envHelper');
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = "debug";

// Import required AWS SDK clients and commands for Node.js
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
// Create SQS service object.
const sqsClient = new SQSClient({region: envVariables.REGION});

const SubscriptionNotification = async(customerUHID,patientId,customerName,planName = "",productName = "") =>{
    let messageId = UUIDGenerator();
    let correlationId = UUIDGenerator();
    logger.info("new correlationId is:",correlationId)

    const notificationBody = {
        key: {
            messageId: messageId,
            clinicalUhid: customerUHID,
            patientId: patientId,
            correlationId: correlationId
        },
        message: {
            type: "MOBILE_PUSH",
            content: {
                title: "Care subscription enrollment status",
                body: `Dear ${customerName}, You have successfully subscribed with ${productName} - ${planName}`,
                type: "CARE_SUBSCRIPTION",
                status : "CREATED",
                additionalInfo:{
                    isUcMember:"true",
                    planName: planName
                } 
            }
        }
    }
    logger.info("Notification Body to be send in SQS",notificationBody);

    // Notification queue
    const notificationInput = { // SendMessageRequestInput
    QueueUrl: envVariables.SUBSCRIPTION_QUEUE_URL, // required
    MessageBody: JSON.stringify(notificationBody), // required
    DelaySeconds: 0,
    MaxNumberOfMessages: 1,
    MessageAttributes:{
        messageType:{
            StringValue: "CARE_SUBSCRIPTION",
            DataType: "String", // required
        }
    }
    };
    try {
        let command = new SendMessageCommand(notificationInput)
        const data = await sqsClient.send(command);
        if (data.MessageId) {
            logger.info("Notification message is successfully pushed with MessageId", data.MessageId)
        }
    } catch (err) {
        logger.error("Send Error", err);
    }
}

const InvoiceNotification = async(customerUHID,patientId,customerName,planName="",productName="") =>{
    let messageId = UUIDGenerator();
    let correlationId = UUIDGenerator();
    logger.info("new correlationId is:",correlationId)

    const notificationBody = {
        key: {
            messageId: messageId,
            clinicalUhid: customerUHID,
            patientId: patientId,
            correlationId: correlationId
        },
        message: {
            type: "MOBILE_PUSH",
            content: {
                title: `Invoice successfully generated for the subscription`,
                body: `Dear ${customerName}, Invoice successfully generated for your plan ${productName} - ${planName}`,
                type: "CARE_INVOICE"
            }
        }
    }
    logger.info("Notification Body to be send in SQS",notificationBody);

    // Notification queue
    const notificationInput = { // SendMessageRequestInput
    QueueUrl: envVariables.NOTIFICATION_QUEUE_URL, // required
    MessageBody: JSON.stringify(notificationBody), // required
    DelaySeconds: 0,
    MaxNumberOfMessages: 1
    };
    try {
        let command = new SendMessageCommand(notificationInput)
        const data = await sqsClient.send(command);
        if (data.MessageId) {
            logger.info("Notification message is successfully pushed with MessageId", data.MessageId)
        }
    } catch (err) {
        logger.error("Send Error", err);
    }
}

module.exports = { SubscriptionNotification, InvoiceNotification };