import argparse
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist-cloud"

if not DIST.is_dir():
    raise SystemExit("frontend/dist-cloud 不存在，请先运行 npm run build:cloud")

app = FastAPI(title="下一节 cloud fixture")
app.mount("/", StaticFiles(directory=str(DIST), html=True), name="cloud")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=17998)
    args = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
