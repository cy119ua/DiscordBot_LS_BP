@echo off
setlocal enabledelayedexpansion

REM === 0) Проверка наличия Git ===
git --version >NUL 2>&1
if errorlevel 1 (
  echo [ERR] Git не найден. Установи Git и добавь в PATH.
  pause
  exit /b 1
)

REM === 1) Определим текущую ветку ===
for /f "delims=" %%i in ('git rev-parse --abbrev-ref HEAD') do set BR=%%i
if "%BR%"=="" (
  echo [ERR] Не удалось определить ветку.
  pause
  exit /b 1
)

REM === 2) Опционально проверим LFS (не критично, просто предупреждение) ===
git lfs version >NUL 2>&1
if errorlevel 1 (
  echo [WARN] Git LFS не установлен. Большие файлы могут не пушиться. Установи с https://git-lfs.github.com
) else (
  echo [OK] Git LFS найден.
)

REM === 3) Показать статус для наглядности ===
echo.
echo =================== GIT STATUS ===================
git status
echo ==================================================
echo.

REM === 4) Коммит (сообщение можно передать параметрами к батнику) ===
set MSG=%*
if "%MSG%"=="" set MSG=Обновление проекта

echo [STEP] Добавляю изменения...
git add .
if errorlevel 1 goto :git_err

echo [STEP] Делаю commit: "%MSG%"
git commit -m "%MSG%"
if errorlevel 1 (
  echo [INFO] Возможно, нечего коммитить (No changes). Продолжаю...
)

REM === 5) Подтянуть удалённые изменения без merge-коммита ===
echo [STEP] Pull --rebase из origin/%BR% ...
git pull --rebase origin %BR%
if errorlevel 1 (
  echo.
  echo [CONFLICT] Обнаружены конфликты во время rebase.
  echo 1) Исправь конфликты в файлах (они помечены <<<<<<< ======= >>>>>>>)
  echo 2) git add ИСПРАВЛЕННЫЕ_ФАЙЛЫ
  echo 3) git rebase --continue
  echo 4) Запусти gitupdate.bat снова или сам сделай push.
  pause
  exit /b 1
)

REM === 6) Push ===
echo [STEP] Пушу в origin/%BR% ...
git push origin %BR%
if errorlevel 1 goto :git_err

echo.
echo ✅ Готово! Ветка %BR% успешно обновлена.
pause
exit /b 0

:git_err
echo.
echo [ERR] Возникла ошибка при выполнении git-команды.
echo Подсказка: проверь интернет/доступы, попробуй снова.
pause
exit /b 1
