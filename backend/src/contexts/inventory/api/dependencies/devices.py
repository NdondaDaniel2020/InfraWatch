from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.contexts.inventory.repositories.device_repository import DeviceRepository
from src.contexts.inventory.services.device_command_service import DeviceCommandService
from src.contexts.inventory.services.device_query_service import DeviceQueryService
from src.core.database.session import get_db_session

def get_device_repository(session: AsyncSession = Depends(get_db_session)) -> DeviceRepository:
    return DeviceRepository(session)

def get_device_command_service(
    session: AsyncSession = Depends(get_db_session),
    repository: DeviceRepository = Depends(get_device_repository),
) -> DeviceCommandService:
    return DeviceCommandService(session, repository)

def get_device_query_service(
    session: AsyncSession = Depends(get_db_session)
) -> DeviceQueryService:
    return DeviceQueryService(session)

DeviceCommandServiceDep = Annotated[DeviceCommandService, Depends(get_device_command_service)]
DeviceQueryServiceDep = Annotated[DeviceQueryService, Depends(get_device_query_service)]
