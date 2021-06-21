function (user, context, callback) {
  const namespace = "https://hasura.io/jwt/claims";
  const authUserId = user.user_id;
  const adminSecret = "Ha5uraWBStaging";
  const url = "https://graph-staging.whitebrick.com/v1/graphql";
  const query = `
    mutation($authUserId: String!) {
      wbAuth(
        authUserId: $authUserId,
        schemaName: "test_the_daisy_blog"
      )
    }
  `;
  const variables = { "authUserId": authUserId};
  request.post(
    {
      url: url,
      headers: {'content-type' : 'application/json', 'X-Hasura-Admin-Secret': adminSecret},
      body: JSON.stringify({
        query: query,
        variables: variables
      })
    }, function(error, response, body){
      if (error) return callback(error);
      console.log(body);
      context.idToken[namespace] = JSON.parse(body).data.wbAuth;
      if(!context.idToken[namespace]["X-Hasura-User-ID"]){
        return callback(new Error("User not found"));
      } else {
        return callback(null, user, context);
      }
    }
  );
}