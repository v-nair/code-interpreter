from pydantic import BaseModel, field_validator


class CodeRequest(BaseModel):
    task: str

    @field_validator("task")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Task must not be empty")
        return v.strip()
