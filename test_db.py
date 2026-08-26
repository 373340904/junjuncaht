import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def test():
    url = "postgresql+asyncpg://neondb_owner:npg_DY7vaVCdSJ9G@ep-snowy-haze-axhmg19a-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require"
    e = create_async_engine(url)
    try:
        async with e.connect() as c:
            r = await c.execute(text("SELECT 1"))
            print("DB OK:", r.scalar())
    finally:
        await e.dispose()

asyncio.run(test())
