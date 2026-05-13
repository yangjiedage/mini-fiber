async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('start');
    const titleEle = document.getElementById('title');
    titleEle.innerHTML = 'start';
    let i = 0;
    for (let j = 0; j < 5000000000; j++) {
        i++;
    }
    // const titleEle = document.getElementById('title');
    titleEle.innerHTML = 'end';
}

main();
