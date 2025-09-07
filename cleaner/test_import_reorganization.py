#!/usr/bin/env python3
"""Test file per verificare la riorganizzazione degli import."""
from datetime import datetime  # Altro import sparso
from pathlib import Path  # Import sparso
import json  # Terzo import sparso
import os  # Import sparso nel codice
import sys

def some_function():
    """Una funzione che usa import sparsi."""

    
    result = []
    

    
    current_time = datetime.now()
    

    
    data = {
        'time': current_time.isoformat(),
        'cwd': os.getcwd()
    }
    
    return json.dumps(data)

# Import iniziale corretto

def main():
    """Funzione principale."""

    
    print("Test riorganizzazione import")
    print(some_function())
    
    # Usa pathlib
    current_dir = Path('.')
    print(f"Directory: {current_dir.absolute()}")

if __name__ == '__main__':
    main()
