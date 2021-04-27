export const query = `
  query{
    wbTenants{
      name
    }
  }
`;

export const mutation = `
  mutation{
    createTenant(name: "hello", label: "hello world")
  }
`;