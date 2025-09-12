@echo off
setlocal ENABLEDELAYEDEXPANSION

REM === Консоль в UTF-8 (чтобы кириллица не ломалась) ===
chcp 65001 >NUL

REM === Проверка Git ===
git --version >NUL 2>&1 || (
  echo [ERR] Git не найден. Установи Git и добавь в PATH.
  pause & exit /b 1
)

REM === Текущая ветка ===
for /f "delims=" %%i in ('git rev-parse --abbrev-ref HEAD') do set "BR=%%i"
if not defined BR (
  echo [ERR] Не удалось определить ветку.
  pause & exit /b 1
)

REM === Проверка LFS (как предупреждение) ===
git lfs version >NUL 2>&1 && (
  echo [OK] Git LFS найден.
) || (
  echo [WARN] Git LFS не установлен. Большие файлы могут не пушиться. https://git-lfs.github.com
)

echo.
echo =================== GIT STATUS ===================
git status
echo ==================================================
echo.

REM === Сообщение коммита ===
REM Берём исходный текст как есть (без добавления лишних кавычек)
set "MSG=%*"
if "!MSG!"=="" set "MSG=Обновление проекта"

echo [STEP] Добавляю изменения...
git add .
if errorlevel 1 goto GIT_ERR

echo [STEP] Делаю commit...
REM ВАЖНО: передаём аргументы без двойного цитирования вокруг %*,
REM чтобы не получить ""Сообщение"" (что ломает парсер CMD).
REM Если пользователь сам обернул в кавычки — они и так попадут корректно.
if "%~1"=="" (
  git commit -m "Обновление проекта"
) else (
  git commit -m %*
)

if errorlevel 1 (
  echo [INFO] Возможно, нечего коммитить (No changes). Продолжаю...
)

echo [STEP] Pull --rebase из origin/%BR% ...
git pull --rebase origin %BR%
if errorlevel 1 (
  echo.
  echo [CONFLICT] Обнаружены конфликты во время rebase.
  echo   1) Исправь конфликты в файлах.
  echo   2) git add исправленные_файлы
  echo   3) git rebase --continue
  echo   4) Запусти этот скрипт снова или сделай push вручную.
  pause & exit /b 1
)

echo [STEP] Push в origin/%BR% ...
git push origin %BR%
if errorlevel 1 goto GIT_ERR

echo.
echo ✅ Готово! Ветка %BR% успешно обновлена.
pause
exit /b 0

:GIT_ERR
echo.
echo [ERR] Возникла ошибка при выполнении git-команды.
echo Проверь соединение/доступы и попробуй снова.
pause
exit /b 1
