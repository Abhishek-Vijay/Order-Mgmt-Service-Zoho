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
                status : "COMPLETED",
                additionalInfo:{
                    isUcMember:"true",
                    planName: planName
                } 
            }
        }
    }
    logger.info("Notification Body to be send in SQS",JSON.stringify(notificationBody));

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

const InvoiceNotification = async(customerUHID,patientId,customerName,invoice_type,payment_status,amount="",planName="",productName="") =>{
    let messageId = UUIDGenerator();
    let correlationId = UUIDGenerator();
    let content;
    logger.info("new correlationId is:",correlationId)

    if(invoice_type == "LAB_ORDER"){
        if(payment_status=="DUE"){
            content = {
                title: `Invoice successfully generated for the lab order`,
                body: `Dear ${customerName}, We are looking forward to providing the best care for you. Kindly click here to complete the payment of ${amount}`,
                type: "CARE_INVOICE",
                status: payment_status
            }
        }else if(payment_status=="PAID"){
            content = {
                title: `Invoice payment successful for the lab order`,
                body: `Dear ${customerName}, Thank you for trusting us to better your health. This is a confirmation for receipt of INR ${amount} towards the UHID ${customerUHID}`,
                type: "CARE_INVOICE",
                status: payment_status
            }
        }     
    }else{
        content = {
            title: `Invoice successfully generated for the subscription`,
            body: `Dear ${customerName}, Invoice successfully generated for your plan ${productName} - ${planName}`,
            type: "CARE_INVOICE",
            status: payment_status
        }
    }

    const notificationBody = {
        key: {
            messageId: messageId,
            clinicalUhid: customerUHID,
            patientId: patientId,
            correlationId: correlationId
        },
        message: {
            type: "MOBILE_PUSH",
            content: content
        }
    }
    logger.info("Notification Body to be send in SQS",JSON.stringify(notificationBody));

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