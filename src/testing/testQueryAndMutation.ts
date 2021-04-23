export const query = `
  query{
    getTenants{
      name
    }
    getTenantById(id:"demoid"){
      name
    }
    getTenantByName(name:"demo"){
      name
    }
    getUserByName(firstName:"demo"){
      firstName
    }
    getUserByEmail(email:"demo"){
      firstName
    }
    getUserByTenantID(tenantId:"demoid"){
      firstName
    }
    getUsersByTenantName(tenant_name:"demo"){
      firstName
    }
  }
`;

export const mutation = `
  mutation{
    createTenant(name:"demo",label:"upwork")
    updateTenant(id:"demoID",name:"demo",label:"upwork2")
    createUser(tenant_id:"demoID",email:"demo",first_name:"demo",last_name:"demo")
    updateUser(id:"demoID",email:"demo", first_name:"demo", last_name:"demo")
  }
`;