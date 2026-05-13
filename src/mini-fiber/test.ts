interface PersonType {
    name?: string;
    age?: number;
}

function Person(this: PersonType, name?: string) {
    this.name = name;
}

const obj: PersonType = { age: 18 };
const BoundPerson = Person.bind(obj);

// 情况 A: 普通调用
BoundPerson('Alice');
console.log(obj.name); // 'Alice'，正确，this 指向了 obj

// 情况 B: 使用 new 调用
// @ts-ignore
const instance = new BoundPerson('Bob');
console.log(instance.name); // 应该是 'Bob'
console.log(obj.name);      // 应该是 'Alice'，不应该被修改为 'Bob'