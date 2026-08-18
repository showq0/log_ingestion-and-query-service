import express from "express";
import errors from "../errors.js";

export default function errorsHandling(err: Error, req: express.Request, res: express.Response, next: express.NextFunction) {
    if (err instanceof errors.UnauthorizedError) {
        res.status(401).json({
            error: err.message
        })
    } else if (err instanceof errors.ForbiddenError) {
        res.status(403).json({
            error: err.message
        })
    } else if (err instanceof errors.BadRequestError || err instanceof SyntaxError) {
        res.status(400).json({
            error: err.message
        })
    } else if (err instanceof errors.NotFoundError) {
        res.status(404).json({
            error: err.message
        })
    } else {
        res.status(500).json({
            error: err.message || err
        })
    }
    next()
}