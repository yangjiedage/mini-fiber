/** @jsx MiniFiber.createElement */
/* @jsxRuntime classic */
import * as MiniFiber from './reconciler.js';

const LetterItem = ({ letter }) => {
    console.log('LetterItem', letter);
    return <div> - {letter}</div>;
};

export default MiniFiber.fakeMemo(LetterItem);