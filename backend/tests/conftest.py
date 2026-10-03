import pytest
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.schema import CreateColumn
from sqlalchemy.sql.elements import TextClause

from sqlalchemy.dialects.postgresql import TSVECTOR

@compiles(CreateColumn, "sqlite")
def compile_create_column_sqlite(element, compiler, **kw):
    # This intercepts the column creation.
    # If the column has a Computed clause with "to_tsvector", we strip the Computed clause for SQLite.
    column = element.element
    if column.computed is not None and "to_tsvector" in str(column.computed.sqltext).lower():
        column.computed = None
    return compiler.visit_create_column(element, **kw)


@compiles(TSVECTOR, "sqlite")
def compile_tsvector_sqlite(type_, compiler, **kw):
    # O SQLite não possui TSVECTOR. Durante os testes, o TSVECTOR virará TEXT.
    return "TEXT"

