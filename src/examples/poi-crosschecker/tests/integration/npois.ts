// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite3 = require("sqlite3").verbose();

const npoisCheck = () => {
  console.log("Starting npoi check...");

  const db = new sqlite3.Database(
    // TODO: Extract this to constant?
    "/usr/app/dist/src/examples/poi-crosschecker/npois.db",
    sqlite3.OPEN_READ,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any) => {
      if (err) {
        console.error(err.message);
      } else {
        console.log("Tests: Connected to the poi-crosschecker database.");
      }
    }
  );

  db.all(
    "SELECT * FROM npois",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any, rows: any) => {
      if (err) {
        console.log(`Tests: An error occurred: ${err.message}`);
      } else {
        console.log("Tests: Here's the DB content:");
        console.log(rows);
      }
    }
  );
};

npoisCheck();
