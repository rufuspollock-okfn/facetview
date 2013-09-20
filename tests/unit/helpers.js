$(function () {
      module("Utility functions");

      // jquery plugin internal functions can not be accessed out of scope
      // I'll just copy it here for testing
      var getvalue = function(obj, dotted_notation) {
            var parts = dotted_notation.split('.');
            parts.reverse();
            var ref = [parts.pop()];
            while (parts.length && !(ref.join(".") in obj)) {
              ref.push(parts.pop());
            }
            var addressed_ob = obj[ref.join(".")];
            var left = parts.reverse().join(".");

            if (addressed_ob && addressed_ob.constructor.toString().indexOf("Array") == -1) {
                if (parts.length)
                  return getvalue(addressed_ob, left);
                else
                  return addressed_ob;
            } else {
                if ( addressed_ob !== undefined ) {
                  var thevalue = [];
                  for ( var row = 0; row < addressed_ob.length; row++ ) {
                      thevalue.push(getvalue(addressed_ob[row], left));
                  }
                  return thevalue;
                } else {
                  return undefined;
                }
            }
        };

      var obj = {
        club: {
          name: 'Golf Pros',
          members: [
            {name: {firstname: "John", lastname: "Doe"}},
            {name: {firstname: "Jane", lastname: "Black"}},
            {name: {firstname: "Dee", lastname: "Dee"}}
          ],
          'honorific.members': [
            {name: {firstname: "Tiger", lastname: "Woods"}},
            {name: {firstname: "Thomas", lastname: "Bjorn"}},
          ],
          contact: [
            {phone: "444"}, {phone: "555"}, {phone: "666"}
          ],
          address: {
            primary:{
              state: 'California'
            }
          }
        }
      };

      test("Testing getvalue facetview internal function", function () {
        equal(getvalue(obj, 'club.name'), 'Golf Pros');
        equal(getvalue(obj, 'club.address.primary.state'), 'California');
        deepEqual(getvalue(obj, 'club.members.name.lastname'), ["Doe", "Black", "Dee"]);
        deepEqual(getvalue(obj, 'club.honorific.members.name.lastname'), ["Woods", "Bjorn"]);
        deepEqual(getvalue(obj, 'club.contact.phone'), ["444", "555", "666"]);
        equal(getvalue(obj, 'other'), undefined);
      });

});