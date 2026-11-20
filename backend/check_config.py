"""Report missing configuration without printing secret values."""
import argparse
import os
from pathlib import Path
from dotenv import load_dotenv


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--strict', action='store_true', help='Exit with failure if any required service configuration is missing')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    load_dotenv(root / '.env.local', override=False)
    load_dotenv(root / '.env', override=False)
    missing = []
    for name in ('OPENAI_API_KEY', 'ADMIN_TOKEN', 'FISHING_API_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY'):
        present = bool(os.getenv(name, '').strip())
        print(f'{name}: {"configured" if present else "missing"}')
        if not present: missing.append(name)
    database_present = bool(os.getenv('TRAIL_DATABASE_URL') or (os.getenv('SUPABASE_URL') and os.getenv('SUPABASE_SECRET_KEY')))
    print(f'statistics_storage: {"configured" if database_present else "missing"}')
    if not database_present: missing.append('statistics_storage')
    return 1 if args.strict and missing else 0


if __name__ == '__main__':
    raise SystemExit(main())
