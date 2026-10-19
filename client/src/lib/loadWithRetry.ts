/** Repetição curta só para falhas de transporte ao carregar uma tela sob demanda. */
export async function loadWithRetry<T>(load:()=>Promise<T>,wait:(ms:number)=>Promise<void> = ms=>new Promise(resolve=>setTimeout(resolve,ms))):Promise<T> {
  for(let attempt=0;;attempt++){
    try{return await load();}
    catch(error){
      const message=error instanceof Error?error.message:'';
      if(attempt>=2||!/fetch|network|loading.*(?:chunk|module)|dynamically imported|importing a module/i.test(message))throw error;
      await wait(attempt===0?250:750);
    }
  }
}
