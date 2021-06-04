Feature: Tables 

  Scenario: Add tables from existing DBs
    * table schemas 
      | schemaName |
      | 'test_chinook'   |
      | 'test_donnasdvd' |
      | 'test_northwind' |
    * def result = call read('tables/table-add-existing.feature') schemas
    * def created = $result[*].response

  Scenario: Create and track test table in existing DB
    * table tables 
      | schemaName | tableName | tableLabel
      | 'test_donnasdvd' | 'test_table' | 'Donnas DVD Test Table'
    * def result = call read('tables/table-create.feature') tables
    
  Scenario: Rename test table in existing DB
    * table tables 
      | schemaName | tableName | newTableName
      | 'test_donnasdvd' | 'test_table' | 'test_table_renamed'
    * def result = call read('tables/table-rename.feature') tables

  Scenario: Relabel test table in existing DB
    * table tables 
      | schemaName | tableName | newTableLabel
      | 'test_donnasdvd' | 'test_table_renamed' | 'Test Table Relabeled'
    * def result = call read('tables/table-relabel.feature') tables

  Scenario: Create and track test tables in new DB
    * table tables 
      | schemaName | tableName | tableLabel
      | 'test_the_daisy_blog' | 'posts'      | 'Blog Posts'
      | 'test_the_daisy_blog' | 'authors'    | 'Authors'
      | 'test_the_daisy_blog' | 'tags'       | 'Tags'
      | 'test_the_daisy_blog' | 'post_tags'  | 'Post Tags'
      | 'test_the_daisy_blog' | 'post_links' | 'Post Links'
    * def result = call read('tables/table-create.feature') tables

  Scenario: Create columns in new DB tables
    * table columns 
      | schemaName            | tableName    | columnName  | columnLabel | columnType
      | 'test_the_daisy_blog' | 'posts'      | 'id'        | 'ID'        | 'integer'
      | 'test_the_daisy_blog' | 'posts'      | 'author_id' | 'Author ID' | 'integer'
      | 'test_the_daisy_blog' | 'posts'      | 'title'     | 'Title'     | 'text'
      | 'test_the_daisy_blog' | 'posts'      | 'body'      | 'Body'      | 'text'
      | 'test_the_daisy_blog' | 'authors'    | 'id'        | 'ID'        | 'integer'
      | 'test_the_daisy_blog' | 'authors'    | 'name'      | 'Full Name' | 'text'
      | 'test_the_daisy_blog' | 'tags'       | 'id'        | 'ID'        | 'integer'
      | 'test_the_daisy_blog' | 'tags'       | 'name'      | 'Tag'       | 'text'
      | 'test_the_daisy_blog' | 'post_tags'  | 'post_id'   | 'Post ID'   | 'integer'
      | 'test_the_daisy_blog' | 'post_tags'  | 'tag_id'    | 'Tag ID'    | 'integer'
      | 'test_the_daisy_blog' | 'post_links' | 'post_id'   | 'Post ID'   | 'integer'
      | 'test_the_daisy_blog' | 'post_links' | 'url'       | 'Link URL'  | 'text'
    * def result = call read('tables/column-create.feature') columns

  Scenario: Set ID primary keys
    * table tables 
      | schemaName | tableName
      | 'test_the_daisy_blog' | 'posts'
      | 'test_the_daisy_blog' | 'authors'
      | 'test_the_daisy_blog' | 'tags'
    * def result = call read('tables/primary_key-set.feature') tables

  Scenario: Set foreign keys
    * table columns 
      | schemaName            | tableName    | columnNames     | parentColumnNames | parentTableName
      | 'test_the_daisy_blog' | 'posts'      | ["author_id"]   | ["id"]            | 'authors'
      | 'test_the_daisy_blog' | 'post_tags'  | ["post_id"]     | ["id"]            | 'posts'
      | 'test_the_daisy_blog' | 'post_tags'  | ["tag_id"]      | ["id"]            | 'tags'
      | 'test_the_daisy_blog' | 'post_links' | ["post_id"]     | ["id"]            | 'posts'
    * def result = call read('tables/foreign_key-set.feature') columns

  Scenario: Load test data for new DB
    * karate.exec("bash load_test_data.bash")