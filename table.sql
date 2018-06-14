CREATE TABLE "session" (
	sid varchar PRIMARY KEY NOT NULL,
	sess json NOT NULL,
	expire timestamp NOT NULL
)
