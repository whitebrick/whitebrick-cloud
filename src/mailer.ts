import * as AWS from "aws-sdk";
import { environment } from "./environment";
import { errResult, log } from "./whitebrick-cloud";

AWS.config.update({
  // accessKeyId: environment.awsSesAccessKey,
  // secretAccessKey: environment.awsSesSecretAccessKey,
  region: "us-east-1",
});

class Mailer {
  send(
    toAddresses: string[],
    subject: string,
    messageText: string,
    messageHtml?: string
  ): Promise<boolean> {
    log.info(
      `Mailer.send(${toAddresses},${subject},${messageText},${messageHtml})`
    );
    if (!messageHtml) messageHtml = messageText;
    const params = {
      Destination: {
        /* required */
        CcAddresses: [],
        ToAddresses: toAddresses,
      },
      Message: {
        /* required */
        Body: {
          /* required */
          Html: {
            Charset: "UTF-8",
            Data: messageHtml,
          },
          Text: {
            Charset: "UTF-8",
            Data: messageText,
          },
        },
        Subject: {
          Charset: "UTF-8",
          Data: subject,
        },
      },
      Source: environment.mailerFromAddress,
      ReplyToAddresses: [environment.mailerFromAddress],
    };

    const sendPromise = new AWS.SES({ apiVersion: "2010-12-01" })
      .sendEmail(params)
      .promise();

    sendPromise
      .then(function (data) {
        console.log(data.MessageId);
      })
      .catch(function (err) {
        console.error(err, err.stack);
      });

    return Promise.resolve(true);
  }
}

export const mailer = new Mailer();
