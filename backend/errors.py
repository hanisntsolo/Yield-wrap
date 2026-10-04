"""Structured error responses: every failure is returned as {"error": "...", "code": "..."}."""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("yieldwrap")


class APIError(Exception):
    def __init__(self, status_code: int, message: str, code: str):
        self.status_code = status_code
        self.message = message
        self.code = code


def not_found(what: str = "Resource") -> APIError:
    return APIError(404, f"{what} not found", "NOT_FOUND")


def forbidden(message: str = "You do not have permission to perform this action") -> APIError:
    return APIError(403, message, "FORBIDDEN")


def conflict(message: str, code: str = "CONFLICT") -> APIError:
    return APIError(409, message, code)


def unauthorized(message: str = "Authentication required", code: str = "UNAUTHORIZED") -> APIError:
    return APIError(401, message, code)


def bad_request(message: str, code: str = "BAD_REQUEST") -> APIError:
    return APIError(400, message, code)


def payment_required(message: str = "Not enough ad credits", code: str = "INSUFFICIENT_CREDITS") -> APIError:
    return APIError(402, message, code)


def field_error(field: str, message: str) -> RequestValidationError:
    """A 422 VALIDATION_ERROR for checks that need data from the database."""
    return RequestValidationError([{"loc": ("body", field), "msg": message, "type": "value_error"}])


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIError)
    async def api_error(_: Request, exc: APIError):
        return JSONResponse({"error": exc.message, "code": exc.code}, status_code=exc.status_code)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException):
        if isinstance(exc.detail, dict) and "error" in exc.detail:
            body = exc.detail
        else:
            body = {"error": str(exc.detail), "code": f"HTTP_{exc.status_code}"}
        return JSONResponse(body, status_code=exc.status_code, headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        details = [
            {"field": ".".join(str(p) for p in err["loc"] if p != "body"), "message": err["msg"]}
            for err in exc.errors()
        ]
        message = details[0]["message"] if details else "Invalid request"
        if details and details[0]["field"]:
            message = f"{details[0]['field']}: {message}"
        return JSONResponse(
            {"error": message, "code": "VALIDATION_ERROR", "details": details}, status_code=422
        )

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):
        logger.exception("Unhandled error", exc_info=exc)
        return JSONResponse({"error": "Internal server error", "code": "INTERNAL_ERROR"}, status_code=500)
