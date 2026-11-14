const { ValidationError } = require("../errors/AppError");

function validate(schemas) {
    return (req, res, next) => {
        const validated = {};

        for (const part of ["params", "query", "body"]) {
            if (!schemas[part]) continue;

            const result = schemas[part].safeParse(req[part] ?? {});

            if (!result.success) {
                const details = result.error.issues.flatMap(issue => {
                    if (issue.code === "unrecognized_keys") {
                        return issue.keys.map(key => ({
                            location: part,
                            field: key,
                            message: `Unrecognized key: "${key}"`
                        }));
                    }

                    return [{
                        location: part,
                        field: issue.path.join(".") || part,
                        message: issue.message
                    }];
                });

                return next(new ValidationError(details));
            }
            validated[part] = result.data;
        }

        req.validated = validated;
        next();
    };
}

module.exports = validate;

