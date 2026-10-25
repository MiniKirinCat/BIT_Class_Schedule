from .api import create_app
from .config import AppConfig
from .security import setup_logging

config = AppConfig()
setup_logging(config.data_dir)
app = create_app(config)
