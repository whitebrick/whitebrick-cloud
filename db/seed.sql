BEGIN;

INSERT INTO tenants (name, label)
VALUES
  ('test_tentant1','Test Tenant 1'),
  ('test_tentant2','Test Tenant 2'),
  ('test_tentant3','Test Tenant 3');

INSERT INTO users (tenant_id, email, first_name, last_name)
VALUES
  (1, 'user_a@example.com','Amy','Addams'),
  (2, 'user_b@example.com','Bill','Bedford'),
  (3, 'user_c@example.com','Chrissy','Church'),
  (3, 'user_d@example.com','Dan','Dressler');

COMMIT;