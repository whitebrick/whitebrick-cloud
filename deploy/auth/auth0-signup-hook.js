/**
@param {object} user - The user being created
@param {string} user.id - user id
@param {string} user.tenant - Auth0 tenant name
@param {string} user.username - user name
@param {string} user.email - email
@param {boolean} user.emailVerified - is e-mail verified?
@param {string} user.phoneNumber - phone number
@param {boolean} user.phoneNumberVerified - is phone number verified?
@param {object} user.user_metadata - user metadata
@param {object} user.app_metadata - application metadata
@param {object} context - Auth0 connection and other context info
@param {string} context.requestLanguage - language of the client agent
@param {object} context.connection - information about the Auth0 connection
@param {object} context.connection.id - connection id
@param {object} context.connection.name - connection name
@param {object} context.connection.tenant - connection tenant
@param {object} context.webtask - webtask context
@param {function} cb - function (error, response)
*/
var request = require('request');
module.exports = function (user, context, cb) {
  const adminSecret = "MYSECRET";
  const url = "https://graph.example.com/v1/graphql";
  const query = `
    mutation($userAuthId: String!, $userObj: JSON!) {
      wbSignUp(
        userAuthId: $userAuthId,
        userObj: $userObj
      )
    }
  `;
  const variables = {
    "userAuthId": `auth0|${user.id}`,
    "userObj": user
  };
  
  request.post(
    {
      url: url,
      headers: {'content-type' : 'application/json', 'x-hasura-admin-secret': adminSecret},
      body: JSON.stringify({
        query: query,
        variables: variables
      })
    }, function(error, response, body){
      if(error){
        console.log("**RETURN ERROR: " + JSON.stringify(error));
      }
      if(response.statusCode !== 200){
        console.log("**RETURN RESPONSE: " + JSON.stringify(response));
      }
      if(body){
        try {
          const bodyObj = JSON.parse(body);
          if(!bodyObj || !bodyObj.data || !bodyObj.data.wbSignUp){
            console.log("**RETURN BODY: " + JSON.stringify(body));
          }
        } catch(e) {
          console.log("**ERROR: " + JSON.stringify(e));
        }
      }
      //
    }
  );
  cb();
};