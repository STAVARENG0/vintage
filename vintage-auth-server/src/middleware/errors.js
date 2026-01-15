function notFound(req, res){
  res.status(404).json({ error: "Not found" });
}

function errorHandler(err, req, res, next){
  console.error(err);
  res.status(err.status || 500).json({ error: "Server error", message: err.message || "Unknown error" });
}

module.exports = { notFound, errorHandler };
