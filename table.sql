CREATE TABLE "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
  -- Make this a foreign key referencing your user table
  -- Something like:
  -- ALTER TABLE "session"
  -- ADD FOREIGN KEY ("userId") REFERENCES users(id);
  "userId" varchar 
)
WITH (OIDS=FALSE);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX "IDX_session_expire" ON "session" ("expire");
