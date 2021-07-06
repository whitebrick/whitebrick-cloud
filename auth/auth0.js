function (user, context, callback) {
  const namespace = "https://hasura.io/jwt/claims";
  const userAuthId = user.user_id;
  const schemaName = (context.request.query.schema_name ? context.request.query.schema_name : "test_the_daisy_blog");
  const adminSecret = "Ha5uraWBStaging";
  const url = "https://graph-staging.whitebrick.com/v1/graphql";
  const query = `
    mutation($schemaName: String!, $userAuthId: String!) {
      wbAuth(
				schemaName: $schemaName,
        userAuthId: $userAuthId
      )
    }
  `;
  const variables = { "schemaName": schemaName, "userAuthId": userAuthId };
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