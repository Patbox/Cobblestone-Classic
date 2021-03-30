set args=%1
shift
:start
if [%1] == [] goto done
set args=%args% %1
shift
goto start

:done

deno run --allow-net --allow-read --allow-write --allow-env --no-check --unstable server/deno.ts dev-mode %args%