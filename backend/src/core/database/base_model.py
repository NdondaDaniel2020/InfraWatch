"""Classe base declarativa do SQLAlchemy 2.0 com convenção padronizada de constraints.

A convenção de nomenclatura explícita garante que todas as chaves primárias, estrangeiras,
índices e constraints únicas possuam nomes determinísticos no PostgreSQL e no Alembic.
"""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

# Convenção padronizada de nomes de constraints para migrações limpas e seguras no Alembic
NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Classe base para todos os modelos ORM relacionais do InfraWatch."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)
