function (user, context, callback) {
  const namespace = "https://hasura.io/jwt/claims";
  const authUserId = user.user_id;
  const authUserName = user.nickname;
  const adminSecret = "Ha5uraWBStaging";
  const url = "https://graph-staging.whitebrick.com/v1/graphql";
  const query = `
    mutation($authUserId: String!, $authUserName: String) {
      wbAuth(
        authUserId: $authUserId,
        authUserName: $authUserName,
        schemaName: "test_the_daisy_blog"
      )
    }
  `;
  const variables = { "authUserId": authUserId, "authUserName": authUserName };
  request.post(
    {
      url: url,
      headers: {'content-type' : 'application/json', 'x-hasura-admin-secret': adminSecret},
      body: JSON.stringify({
        query: query,
        variables: variables
      })
    }, function(error, response, body){
        console.log(body);
        context.idToken[namespace] = JSON.parse(body).data.wbAuth;
        callback(null, user, context);
    }
  );
}