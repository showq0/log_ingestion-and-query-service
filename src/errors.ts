
class UnauthorizedError extends Error {
    constructor(message: string) {
        super(message);
    }
}

class ForbiddenError extends Error {
    constructor(message: string) {
        super(message);
    }
}

class BadRequestError extends Error {
    constructor(message: string) {
        super(message);
    }
}

class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export default {
    UnauthorizedError,
    ForbiddenError,
    BadRequestError,
    NotFoundError
}