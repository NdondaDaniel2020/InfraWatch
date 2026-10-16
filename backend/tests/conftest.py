from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.schema import CreateColumn


@compiles(CreateColumn, "sqlite")
def compile_create_column_sqlite(element, compiler, **kw):
    # This intercepts the column creation.
    # If the column has a Computed clause with "to_tsvector", we strip the Computed clause for SQLite.
    column = element.element
    if column.computed is not None and "to_tsvector" in str(column.computed.sqltext).lower():
        column.computed = None
    orig_autoincrement = column.autoincrement
    try:
        if column.primary_key and len(column.table.primary_key.columns) > 1:
            column.autoincrement = False
        return compiler.visit_create_column(element, **kw)
    finally:
        column.autoincrement = orig_autoincrement


@compiles(TSVECTOR, "sqlite")
def compile_tsvector_sqlite(type_, compiler, **kw):
    # O SQLite não possui TSVECTOR. Durante os testes, o TSVECTOR virará TEXT.
    return "TEXT"
