@echo off
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  python start-site.py
) else (
  py -3 start-site.py
)
if errorlevel 1 (
  echo Python 3 is required. Alternatively, publish the site on Render or GitHub Pages.
  pause
)
