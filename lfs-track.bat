@echo off
setlocal

if "%~1"=="" (
  echo Использование: lfs-track.bat "путь/маска"
  echo Примеры:
  echo    lfs-track.bat "slash/oracleJdk-24/**"
  echo    lfs-track.bat "assets/**"
  pause
  exit /b 1
)

git lfs version >NUL 2>&1 || (echo [ERR] Git LFS не установлен. https://git-lfs.github.com & pause & exit /b 1)

set PAT=%~1
echo [STEP] Трекаю в LFS: %PAT%
git lfs track "%PAT%" || (echo [ERR] lfs track не удался & pause & exit /b 1)

echo [STEP] Коммичу .gitattributes
git add .gitattributes && git commit -m "Track %PAT% via Git LFS" || echo [INFO] .gitattributes без изменений

echo [INFO] Готово. Теперь большие файлы по маске будут храниться в LFS.
pause
