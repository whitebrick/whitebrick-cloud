## Architecture & Code Review

### 1. Type Defs and GraphQL Schema - file structure and imports
Can files and definitions be better consolidated? I Feel like I'm repeating myself when it comes to types and schemas 
- Is it better to separate out the schema to individual `.gql` files? If so how do I import them?
- I don't want to use ORM but I have some DB-related types (used in dal.ts) defined in `src/entity` - should these be consolidated into a single type-defs file?
- I also heard about using a [barrel](https://basarat.gitbook.io/typescript/main-1/barrel) file - would you recommend this? whats the best way to set it up

### 2. Returns and Error handling
I want to standardize, simplify and streamline the error handling across postgres `dal.ts` and axios `hasura-api.ts`
- I created a generic [ServiceResult type](https://github.com/whitebrick/whitebrick-cloud/blob/d11e55823fc07ab32d65480c93b6987105ff7c41/src/type-defs.ts#L3)
to encapsulate error messages and codes
- I pass all errors and exceptions up through the code and raise them in the resolvers so Apollo can respond accordingly
- Because of this when a top level method makes multiple calls it checks before it perfoms the next step
(see [this](https://github.com/whitebrick/whitebrick-cloud/blob/d11e55823fc07ab32d65480c93b6987105ff7c41/src/whitebrick-cloud.ts#L96) example) - I feel
like I could be using a better design pattern for this?

## 3. Directives for validation
I tried to add a simple directive `@constraint(minLength: 3)` 
[here](https://github.com/whitebrick/whitebrick-cloud/blob/d11e55823fc07ab32d65480c93b6987105ff7c41/src/type-defs.ts#L93)
with the set up [here](https://github.com/whitebrick/whitebrick-cloud/blob/d11e55823fc07ab32d65480c93b6987105ff7c41/src/whitebrick-cloud.ts#L23)
following the Apollo blog post but couldn't get it working - do you know what I'm missing?

## 4. no-explicit-any lint warning
After I've run a query in postgres I iterate over the returned rows [here](https://github.com/whitebrick/whitebrick-cloud/blob/d11e55823fc07ab32d65480c93b6987105ff7c41/src/dal.ts#L470)
but because I know the column types I expect I don't look them up and I thought I could just use `any` but the 
linter gives me a warning - is there a better way to do this and avoid the warning? Similaraly when I'm trying to parse a row of a DB
record [here](https://github.com/whitebrick/whitebrick-cloud/blob/3199a642059a1314b4d8c27d88bcee1c3a781567/src/entity/Role.ts#L25)

## 5. Testing
I have End-to-end fucntional tests in Karate but I'm not sure how to get started with other testing (unit? or graphQL mocks?).
I want this to be high quality production ready code so what would be the best way to structure the testing? Would you do unit tests at the 
`whitebrick-cloud.ts` leve? Or further down at the `dal.ts` and `hasura-api.ts` level? Or both? I'm just having trouble knowing where to start
without going overboard.


## 6. Linting, commenting, documenting recomendations
I'm trying to work out what is a good level/balance of commenting and documenting for this type of project
- I came across [this](https://the-guild.dev/blog/introducing-graphql-eslint) graphQL linter plugin - should I use it or it's overkill?
- For this type/size of project would you use TSDoc to comment every method? Or just those at the top level in `whitebrick-cloud.ts`?
- Similaraly, would you comment every GraphQL query/mutation? Can you point me to any examples of a goof lelvel of commenting/documentation?

