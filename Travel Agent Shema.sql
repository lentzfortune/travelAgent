create extension if not exists vector;

create table userCategory(
  category_id INTEGER generated always as identity primary key,
  categoryName varchar(50) unique not null
);

create table users(
  ID  integer generated always as identity primary key,
  userName varchar(50) Not Null,
  category_id integer Not Null,
  foreign key (category_id) references userCategory(category_id)
);



create table message(
  message_id integer generated always as identity primary key not null,
  user_id integer not null,
  userInput text not null,
  embedding vector(1536) not null,
  foreign key (user_id) references users(ID)
);

ALTER TABLE message
ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

