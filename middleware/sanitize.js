// DBMS CONCEPT: INJECTION PREVENTION (Unit 3 Session 33 - SQL Injection)
// In MongoDB the attack is "NoSQL injection": e.g. login with { "email": { "$ne": null } }
// which would match ANY user. We remove keys starting with "$" or containing "." from user input.
function clean(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) delete obj[key];
    else clean(obj[key]);
  }
  return obj;
}

module.exports = function sanitize(req, res, next) {
  clean(req.body);
  clean(req.query);
  clean(req.params);
  next();
};
